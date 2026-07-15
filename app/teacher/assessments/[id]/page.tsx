"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { supabase } from "@/lib/supabaseClient";

type QuestionType =
  | "multiple-choice"
  | "short-answer"
  | "fill-in-the-blank"
  | "image-question"
  | "sorting-order"
  | "sorting-category";

type OverlayAnswerMode = "text-entry" | "drag-drop-text" | "drag-drop-image";

type AnswerBox = {
  id: string;
  label: string;
  correctAnswer: string;
};

type BlankBox = {
  id: string;
  correctAnswer: string;
};

type OverlayBox = {
  id: string;
  label: string;
  correctAnswer: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DraggableChoice = {
  id: string;
  text: string;
};

type DraggableImageChoice = {
  id: string;
  label: string;
  imageUrl: string;
  imagePath: string;
};

type SortingItem = {
  id: string;
  text: string;
  imageUrl?: string;
  imagePath?: string;
  correctCategoryId?: string;
};

type SortingCategory = {
  id: string;
  name: string;
};

type Assessment = {
  id: string;
  title: string;
  description: string | null;
  assessment_code: string;
  is_published: boolean;
};

type Question = {
  id: string;
  assessment_id: string;
  question_type: QuestionType;
  prompt: string;
  question_data: {
    choices?: string[];
    correctAnswer?: string;
    answerBoxes?: AnswerBox[];
    template?: string;
    blanks?: BlankBox[];
    imageUrl?: string;
    imagePath?: string;
    overlayBoxes?: OverlayBox[];
    overlayAnswerMode?: OverlayAnswerMode;
    draggableChoices?: DraggableChoice[];
    draggableImageChoices?: DraggableImageChoice[];
    sortingItems?: SortingItem[];
    sortingCategories?: SortingCategory[];
    correctOrder?: string[];
  };
  question_order: number;
};

type DragMode = "move" | "resize" | null;

type DragState = {
  boxId: string;
  mode: DragMode;
  startMouseX: number;
  startMouseY: number;
  startBox: OverlayBox;
};

function createAnswerBox(): AnswerBox {
  return {
    id: crypto.randomUUID(),
    label: "",
    correctAnswer: "",
  };
}

function createOverlayBox(): OverlayBox {
  return {
    id: crypto.randomUUID(),
    label: "",
    correctAnswer: "",
    x: 10,
    y: 10,
    width: 20,
    height: 10,
  };
}

function createDraggableChoice(text = ""): DraggableChoice {
  return {
    id: crypto.randomUUID(),
    text,
  };
}

function createDraggableImageChoice(): DraggableImageChoice {
  return {
    id: crypto.randomUUID(),
    label: "",
    imageUrl: "",
    imagePath: "",
  };
}

function createSortingItem(text = ""): SortingItem {
  return {
    id: crypto.randomUUID(),
    text,
    imageUrl: "",
    imagePath: "",
  };
}

function sortingItemHasContent(item: SortingItem) {
  return Boolean(item.text.trim() || item.imageUrl || item.imagePath);
}

function getSortingItemDisplayLabel(item: SortingItem, fallback: string) {
  if (item.text.trim()) {
    return item.text.trim();
  }

  return fallback;
}

function createSortingCategory(name = ""): SortingCategory {
  return {
    id: crypto.randomUUID(),
    name,
  };
}

function extractBlanksFromTemplate(template: string): BlankBox[] {
  const matches = [...template.matchAll(/\[\[(.*?)\]\]/g)];

  return matches.map((match, index) => ({
    id: `blank-${index + 1}`,
    correctAnswer: match[1].trim(),
  }));
}

function makeStudentPreview(template: string) {
  return template.replace(/\[\[(.*?)\]\]/g, "[ answer box ]");
}

function cleanFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-+/g, "-");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAnswer(answer: string | undefined) {
  return (answer || "").trim().toLowerCase();
}

export default function AssessmentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [assessmentId, setAssessmentId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [questionType, setQuestionType] =
    useState<QuestionType>("multiple-choice");

  const [prompt, setPrompt] = useState("");

  const [choiceA, setChoiceA] = useState("");
  const [choiceB, setChoiceB] = useState("");
  const [choiceC, setChoiceC] = useState("");
  const [choiceD, setChoiceD] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("A");

  const [answerBoxes, setAnswerBoxes] = useState<AnswerBox[]>([
    createAnswerBox(),
  ]);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState("");
  const [existingImagePath, setExistingImagePath] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  const [overlayBoxes, setOverlayBoxes] = useState<OverlayBox[]>([]);
  const [selectedOverlayBoxId, setSelectedOverlayBoxId] = useState<
    string | null
  >(null);
  const [overlayAnswerMode, setOverlayAnswerMode] =
    useState<OverlayAnswerMode>("text-entry");
  const [draggableChoices, setDraggableChoices] = useState<DraggableChoice[]>([
    createDraggableChoice(),
  ]);
  const [draggableImageChoices, setDraggableImageChoices] = useState<
    DraggableImageChoice[]
  >([]);
  const [selectedImageChoiceFiles, setSelectedImageChoiceFiles] = useState<
    Record<string, File>
  >({});
  const [imageChoicePreviewUrls, setImageChoicePreviewUrls] = useState<
    Record<string, string>
  >({});
  const [selectedSortingItemFiles, setSelectedSortingItemFiles] = useState<
    Record<string, File>
  >({});
  const [sortingItemPreviewUrls, setSortingItemPreviewUrls] = useState<
    Record<string, string>
  >({});

  const [sortingItems, setSortingItems] = useState<SortingItem[]>([
    createSortingItem(),
    createSortingItem(),
  ]);
  const [sortingCategories, setSortingCategories] = useState<SortingCategory[]>([
    createSortingCategory("Category 1"),
    createSortingCategory("Category 2"),
  ]);

  const imageAreaRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);

  const imageQuestionIsScored = useMemo(() => {
    return overlayBoxes.length > 0;
  }, [overlayBoxes]);

  useEffect(() => {
    async function getParams() {
      const resolvedParams = await params;
      setAssessmentId(resolvedParams.id);
      loadAssessment(resolvedParams.id);
    }

    getParams();
  }, [params]);

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!dragState || !imageAreaRef.current) {
        return;
      }

      const imageRect = imageAreaRef.current.getBoundingClientRect();

      const deltaXPercent =
        ((event.clientX - dragState.startMouseX) / imageRect.width) * 100;
      const deltaYPercent =
        ((event.clientY - dragState.startMouseY) / imageRect.height) * 100;

      setOverlayBoxes((currentBoxes) =>
        currentBoxes.map((box) => {
          if (box.id !== dragState.boxId) {
            return box;
          }

          if (dragState.mode === "move") {
            const newX = clampNumber(
              dragState.startBox.x + deltaXPercent,
              0,
              100 - dragState.startBox.width
            );

            const newY = clampNumber(
              dragState.startBox.y + deltaYPercent,
              0,
              100 - dragState.startBox.height
            );

            return {
              ...box,
              x: Number(newX.toFixed(2)),
              y: Number(newY.toFixed(2)),
            };
          }

          if (dragState.mode === "resize") {
            const newWidth = clampNumber(
              dragState.startBox.width + deltaXPercent,
              3,
              100 - dragState.startBox.x
            );

            const newHeight = clampNumber(
              dragState.startBox.height + deltaYPercent,
              3,
              100 - dragState.startBox.y
            );

            return {
              ...box,
              width: Number(newWidth.toFixed(2)),
              height: Number(newHeight.toFixed(2)),
            };
          }

          return box;
        })
      );
    }

    function handlePointerUp() {
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState]);

  async function loadAssessment(id: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: assessmentData, error: assessmentError } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", id)
      .single();

    if (assessmentError) {
      alert(assessmentError.message);
      setLoading(false);
      return;
    }

    const { data: questionData, error: questionError } = await supabase
      .from("questions")
      .select("*")
      .eq("assessment_id", id)
      .order("question_order", { ascending: true });

    if (questionError) {
      alert(questionError.message);
      setLoading(false);
      return;
    }

    setAssessment(assessmentData);
    setQuestions((questionData || []) as Question[]);
    setLoading(false);
  }

  function resetQuestionForm() {
    setQuestionType("multiple-choice");
    setPrompt("");

    setChoiceA("");
    setChoiceB("");
    setChoiceC("");
    setChoiceD("");
    setCorrectAnswer("A");

    setAnswerBoxes([createAnswerBox()]);

    setSelectedImageFile(null);
    setExistingImageUrl("");
    setExistingImagePath("");
    setImagePreviewUrl("");

    setOverlayBoxes([]);
    setSelectedOverlayBoxId(null);
    setOverlayAnswerMode("text-entry");
    setDraggableChoices([createDraggableChoice()]);
    setDraggableImageChoices([]);
    setSelectedImageChoiceFiles({});
    setImageChoicePreviewUrls({});
    setSelectedSortingItemFiles({});
    setSortingItemPreviewUrls({});
    setSortingItems([createSortingItem(), createSortingItem()]);
    setSortingCategories([createSortingCategory("Category 1"), createSortingCategory("Category 2")]);
    setDragState(null);

    setEditingQuestionId(null);
  }

  function getChoicesFromForm() {
    return [choiceA.trim(), choiceB.trim(), choiceC.trim(), choiceD.trim()];
  }

  function getCorrectChoice(choices: string[]) {
    const answerIndex = ["A", "B", "C", "D"].indexOf(correctAnswer);
    return choices[answerIndex];
  }

  function validateQuestionForm() {
    if (!prompt.trim()) {
      alert("Please enter a question.");
      return false;
    }

    if (questionType === "multiple-choice") {
      const choices = getChoicesFromForm();

      if (choices.some((choice) => choice.length === 0)) {
        alert("Please enter all 4 answer choices.");
        return false;
      }
    }

    if (questionType === "short-answer") {
      if (answerBoxes.length === 0) {
        alert("Please add at least one answer box.");
        return false;
      }

      if (
        answerBoxes.some((answerBox) => answerBox.correctAnswer.trim() === "")
      ) {
        alert("Please enter a correct answer for every answer box.");
        return false;
      }
    }

    if (questionType === "fill-in-the-blank") {
      const blanks = extractBlanksFromTemplate(prompt);

      if (blanks.length === 0) {
        alert("Please add at least one blank using [[answer]].");
        return false;
      }

      if (blanks.some((blank) => blank.correctAnswer === "")) {
        alert("Every blank must contain a correct answer.");
        return false;
      }
    }

    if (questionType === "sorting-order") {
      const cleanedItems = getCleanedSortingItems();

      if (cleanedItems.length < 2) {
        alert("Please add at least two sorting items.");
        return false;
      }
    }

    if (questionType === "sorting-category") {
      const cleanedItems = getCleanedSortingItems();
      const cleanedCategories = getCleanedSortingCategories();

      if (cleanedCategories.length < 2) {
        alert("Please add at least two categories.");
        return false;
      }

      if (cleanedItems.length < 2) {
        alert("Please add at least two sorting items.");
        return false;
      }

      const categoryIds = cleanedCategories.map((category) => category.id);
      const missingCategory = cleanedItems.find(
        (item) => !item.correctCategoryId || !categoryIds.includes(item.correctCategoryId)
      );

      if (missingCategory) {
        alert("Please choose the correct category for every item.");
        return false;
      }
    }

    if (questionType === "image-question") {
      if (!selectedImageFile && !existingImageUrl) {
        alert("Please upload an image for this question.");
        return false;
      }

      for (const box of overlayBoxes) {
        if (!box.correctAnswer.trim()) {
          alert("Please enter a correct answer for every overlay box.");
          return false;
        }

        if (box.width <= 0 || box.height <= 0) {
          alert("Overlay box width and height must be greater than 0.");
          return false;
        }
      }

      if (overlayAnswerMode === "drag-drop-text" && overlayBoxes.length > 0) {
        const cleanedChoices = draggableChoices
          .map((choice) => choice.text.trim())
          .filter(Boolean);

        if (cleanedChoices.length === 0) {
          alert("Please add at least one draggable choice.");
          return false;
        }

        const missingChoice = overlayBoxes.find(
          (box) =>
            !cleanedChoices.some(
              (choice) =>
                normalizeAnswer(choice) === normalizeAnswer(box.correctAnswer)
            )
        );

        if (missingChoice) {
          alert(
            "Every overlay box correct answer must also appear as a draggable choice."
          );
          return false;
        }
      }

      if (overlayAnswerMode === "drag-drop-image" && overlayBoxes.length > 0) {
        const usableImageChoices = draggableImageChoices.filter(
          (choice) =>
            choice.label.trim() &&
            (choice.imageUrl || selectedImageChoiceFiles[choice.id])
        );

        if (usableImageChoices.length === 0) {
          alert("Please add at least one draggable image choice.");
          return false;
        }

        const usableImageChoiceIds = usableImageChoices.map((choice) => choice.id);

        const missingImageChoice = overlayBoxes.find(
          (box) => !usableImageChoiceIds.includes(box.correctAnswer)
        );

        if (missingImageChoice) {
          alert(
            "Every overlay box correct answer must be selected from the draggable image choices."
          );
          return false;
        }
      }
    }

    return true;
  }

  function updateAnswerBox(
    answerBoxId: string,
    field: "label" | "correctAnswer",
    value: string
  ) {
    setAnswerBoxes((currentBoxes) =>
      currentBoxes.map((box) =>
        box.id === answerBoxId ? { ...box, [field]: value } : box
      )
    );
  }

  function addAnswerBox() {
    setAnswerBoxes((currentBoxes) => [...currentBoxes, createAnswerBox()]);
  }

  function removeAnswerBox(answerBoxId: string) {
    if (answerBoxes.length === 1) {
      alert("A short answer question must have at least one answer box.");
      return;
    }

    setAnswerBoxes((currentBoxes) =>
      currentBoxes.filter((box) => box.id !== answerBoxId)
    );
  }

  function handleImageFileChange(file: File | null) {
    setSelectedImageFile(file);

    if (!file) {
      setImagePreviewUrl(existingImageUrl);
      return;
    }

    setImagePreviewUrl(URL.createObjectURL(file));
  }

  function addOverlayBox() {
    const newBox = createOverlayBox();
    setOverlayBoxes((current) => [...current, newBox]);
    setSelectedOverlayBoxId(newBox.id);
  }

  function removeOverlayBox(overlayBoxId: string) {
    setOverlayBoxes((current) =>
      current.filter((box) => box.id !== overlayBoxId)
    );

    if (selectedOverlayBoxId === overlayBoxId) {
      setSelectedOverlayBoxId(null);
    }
  }

  function updateOverlayBox(
    overlayBoxId: string,
    field: keyof OverlayBox,
    value: string | number
  ) {
    setOverlayBoxes((current) =>
      current.map((box) => {
        if (box.id !== overlayBoxId) {
          return box;
        }

        if (
          field === "x" ||
          field === "y" ||
          field === "width" ||
          field === "height"
        ) {
          const numericValue =
            typeof value === "number" ? value : Number(value || 0);

          const updatedBox = {
            ...box,
            [field]:
              field === "x" || field === "y"
                ? clampNumber(numericValue, 0, 100)
                : clampNumber(numericValue, 1, 100),
          };

          return {
            ...updatedBox,
            x: clampNumber(updatedBox.x, 0, 100 - updatedBox.width),
            y: clampNumber(updatedBox.y, 0, 100 - updatedBox.height),
            width: clampNumber(updatedBox.width, 1, 100 - updatedBox.x),
            height: clampNumber(updatedBox.height, 1, 100 - updatedBox.y),
          };
        }

        return {
          ...box,
          [field]: value,
        };
      })
    );
  }

  function startOverlayDrag(
    event: PointerEvent<HTMLDivElement>,
    box: OverlayBox,
    mode: DragMode
  ) {
    event.preventDefault();
    event.stopPropagation();

    setSelectedOverlayBoxId(box.id);

    setDragState({
      boxId: box.id,
      mode,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startBox: box,
    });
  }

  function addDraggableChoice() {
    setDraggableChoices((current) => [...current, createDraggableChoice()]);
  }

  function addCorrectAnswersAsChoices() {
    const existingChoiceTexts = draggableChoices.map((choice) =>
      normalizeAnswer(choice.text)
    );

    const newChoices = overlayBoxes
      .map((box) => box.correctAnswer.trim())
      .filter(Boolean)
      .filter((answer) => !existingChoiceTexts.includes(normalizeAnswer(answer)))
      .map((answer) => createDraggableChoice(answer));

    if (newChoices.length === 0) {
      alert("There are no new correct answers to add.");
      return;
    }

    setDraggableChoices((current) => [
      ...current.filter((choice) => choice.text.trim()),
      ...newChoices,
    ]);
  }

  function updateDraggableChoice(choiceId: string, value: string) {
    setDraggableChoices((current) =>
      current.map((choice) =>
        choice.id === choiceId ? { ...choice, text: value } : choice
      )
    );
  }

  function removeDraggableChoice(choiceId: string) {
    if (draggableChoices.length === 1) {
      setDraggableChoices([createDraggableChoice()]);
      return;
    }

    setDraggableChoices((current) =>
      current.filter((choice) => choice.id !== choiceId)
    );
  }

  function addDraggableImageChoice() {
    setDraggableImageChoices((current) => [
      ...current,
      createDraggableImageChoice(),
    ]);
  }

  function updateDraggableImageChoiceLabel(choiceId: string, value: string) {
    setDraggableImageChoices((current) =>
      current.map((choice) =>
        choice.id === choiceId ? { ...choice, label: value } : choice
      )
    );
  }

  function handleDraggableImageChoiceFile(
    choiceId: string,
    file: File | null
  ) {
    if (!file) {
      setSelectedImageChoiceFiles((current) => {
        const copy = { ...current };
        delete copy[choiceId];
        return copy;
      });

      setImageChoicePreviewUrls((current) => {
        const copy = { ...current };
        delete copy[choiceId];
        return copy;
      });

      return;
    }

    setSelectedImageChoiceFiles((current) => ({
      ...current,
      [choiceId]: file,
    }));

    setImageChoicePreviewUrls((current) => ({
      ...current,
      [choiceId]: URL.createObjectURL(file),
    }));
  }

  function removeDraggableImageChoice(choiceId: string) {
    setDraggableImageChoices((current) =>
      current.filter((choice) => choice.id !== choiceId)
    );

    setSelectedImageChoiceFiles((current) => {
      const copy = { ...current };
      delete copy[choiceId];
      return copy;
    });

    setImageChoicePreviewUrls((current) => {
      const copy = { ...current };
      delete copy[choiceId];
      return copy;
    });

    setOverlayBoxes((current) =>
      current.map((box) =>
        box.correctAnswer === choiceId ? { ...box, correctAnswer: "" } : box
      )
    );
  }

  function updateSortingItem(
    itemId: string,
    field: "text" | "correctCategoryId" | "imageUrl" | "imagePath",
    value: string
  ) {
    setSortingItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function updateSortingItemFile(itemId: string, file: File | null) {
    if (!file) {
      setSelectedSortingItemFiles((current) => {
        const copy = { ...current };
        delete copy[itemId];
        return copy;
      });

      setSortingItemPreviewUrls((current) => ({
        ...current,
        [itemId]: sortingItems.find((item) => item.id === itemId)?.imageUrl || "",
      }));
      return;
    }

    setSelectedSortingItemFiles((current) => ({
      ...current,
      [itemId]: file,
    }));

    const reader = new FileReader();
    reader.onload = () => {
      setSortingItemPreviewUrls((current) => ({
        ...current,
        [itemId]: typeof reader.result === "string" ? reader.result : "",
      }));
    };
    reader.readAsDataURL(file);
  }

  function addSortingItem() {
    setSortingItems((current) => [...current, createSortingItem()]);
  }

  function removeSortingItem(itemId: string) {
    if (sortingItems.length <= 1) {
      alert("A sorting question must have at least one item.");
      return;
    }

    setSortingItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedSortingItemFiles((current) => {
      const copy = { ...current };
      delete copy[itemId];
      return copy;
    });
    setSortingItemPreviewUrls((current) => {
      const copy = { ...current };
      delete copy[itemId];
      return copy;
    });
  }

  function moveSortingItem(itemId: string, direction: "up" | "down") {
    setSortingItems((current) => {
      const currentIndex = current.findIndex((item) => item.id === itemId);

      if (currentIndex === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const updated = [...current];
      const [item] = updated.splice(currentIndex, 1);
      updated.splice(targetIndex, 0, item);
      return updated;
    });
  }

  function updateSortingCategory(categoryId: string, value: string) {
    setSortingCategories((current) =>
      current.map((category) =>
        category.id === categoryId ? { ...category, name: value } : category
      )
    );
  }

  function addSortingCategory() {
    setSortingCategories((current) => [
      ...current,
      createSortingCategory(`Category ${current.length + 1}`),
    ]);
  }

  function removeSortingCategory(categoryId: string) {
    if (sortingCategories.length <= 1) {
      alert("A category sorting question must have at least one category.");
      return;
    }

    setSortingCategories((current) =>
      current.filter((category) => category.id !== categoryId)
    );

    setSortingItems((current) =>
      current.map((item) =>
        item.correctCategoryId === categoryId
          ? { ...item, correctCategoryId: "" }
          : item
      )
    );
  }

  function getCleanedSortingItems() {
    return sortingItems
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        text: item.text.trim(),
        imageUrl: item.imageUrl || "",
        imagePath: item.imagePath || "",
        correctCategoryId: item.correctCategoryId || "",
      }))
      .filter(
        (item) =>
          sortingItemHasContent(item) || Boolean(selectedSortingItemFiles[item.id])
      );
  }

  function getCleanedSortingCategories() {
    return sortingCategories
      .map((category) => ({
        id: category.id || crypto.randomUUID(),
        name: category.name.trim(),
      }))
      .filter((category) => category.name.length > 0);
  }

  async function uploadSortingItemImages(items: SortingItem[]) {
    const uploadedItems: SortingItem[] = [];

    for (const item of items) {
      const selectedFile = selectedSortingItemFiles[item.id];

      if (!selectedFile) {
        uploadedItems.push(item);
        continue;
      }

      const safeFileName = cleanFileName(selectedFile.name);
      const filePath = `${assessmentId}/sorting-${Date.now()}-${item.id}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("question-images")
        .upload(filePath, selectedFile, {
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage
        .from("question-images")
        .getPublicUrl(filePath);

      uploadedItems.push({
        ...item,
        imageUrl: data.publicUrl,
        imagePath: filePath,
      });
    }

    return uploadedItems;
  }

  async function uploadQuestionImage() {
    if (!selectedImageFile) {
      return {
        imageUrl: existingImageUrl,
        imagePath: existingImagePath,
      };
    }

    setUploadingImage(true);

    const safeFileName = cleanFileName(selectedImageFile.name);
    const filePath = `${assessmentId}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("question-images")
      .upload(filePath, selectedImageFile, {
        upsert: false,
      });

    if (uploadError) {
      setUploadingImage(false);
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from("question-images")
      .getPublicUrl(filePath);

    setUploadingImage(false);

    return {
      imageUrl: data.publicUrl,
      imagePath: filePath,
    };
  }

  function getCleanedOverlayBoxes() {
    return overlayBoxes.map((box, index) => ({
      id: box.id || crypto.randomUUID(),
      label: box.label.trim() || `Box ${index + 1}`,
      correctAnswer: box.correctAnswer.trim(),
      x: clampNumber(Number(box.x), 0, 100),
      y: clampNumber(Number(box.y), 0, 100),
      width: clampNumber(Number(box.width), 1, 100),
      height: clampNumber(Number(box.height), 1, 100),
    }));
  }

  function getCleanedDraggableChoices() {
    return draggableChoices
      .map((choice) => ({
        id: choice.id || crypto.randomUUID(),
        text: choice.text.trim(),
      }))
      .filter((choice) => choice.text.length > 0);
  }

  async function uploadDraggableImageChoices() {
    const uploadedChoices: DraggableImageChoice[] = [];

    for (const choice of draggableImageChoices) {
      const label = choice.label.trim();

      if (!label && !choice.imageUrl && !selectedImageChoiceFiles[choice.id]) {
        continue;
      }

      if (!label) {
        throw new Error("Every draggable image choice needs a label.");
      }

      const selectedFile = selectedImageChoiceFiles[choice.id];

      if (selectedFile) {
        const safeFileName = cleanFileName(selectedFile.name);
        const filePath = `${assessmentId}/choices/${Date.now()}-${
          choice.id
        }-${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("question-images")
          .upload(filePath, selectedFile, {
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const { data } = supabase.storage
          .from("question-images")
          .getPublicUrl(filePath);

        uploadedChoices.push({
          id: choice.id,
          label,
          imageUrl: data.publicUrl,
          imagePath: filePath,
        });
      } else if (choice.imageUrl) {
        uploadedChoices.push({
          id: choice.id,
          label,
          imageUrl: choice.imageUrl,
          imagePath: choice.imagePath,
        });
      } else {
        throw new Error("Every draggable image choice needs an image.");
      }
    }

    return uploadedChoices;
  }

  async function addQuestion() {
    if (!assessmentId) {
      alert("Assessment not loaded yet.");
      return;
    }

    if (!validateQuestionForm()) {
      return;
    }

    try {
      if (questionType === "multiple-choice") {
        const choices = getChoicesFromForm();
        const correctChoice = getCorrectChoice(choices);

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "multiple-choice",
          prompt: prompt.trim(),
          question_data: {
            choices,
            correctAnswer: correctChoice,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "short-answer") {
        const cleanedAnswerBoxes = answerBoxes.map((box, index) => ({
          id: box.id || crypto.randomUUID(),
          label: box.label.trim() || `Answer ${index + 1}`,
          correctAnswer: box.correctAnswer.trim(),
        }));

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "short-answer",
          prompt: prompt.trim(),
          question_data: {
            answerBoxes: cleanedAnswerBoxes,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "fill-in-the-blank") {
        const blanks = extractBlanksFromTemplate(prompt);

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "fill-in-the-blank",
          prompt: makeStudentPreview(prompt.trim()),
          question_data: {
            template: prompt.trim(),
            blanks,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "sorting-order") {
        const cleanedItems = await uploadSortingItemImages(getCleanedSortingItems());

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "sorting-order",
          prompt: prompt.trim(),
          question_data: {
            sortingItems: cleanedItems.map(({ id, text, imageUrl, imagePath }) => ({
              id,
              text,
              imageUrl,
              imagePath,
            })),
            correctOrder: cleanedItems.map((item) => item.id),
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "sorting-category") {
        const cleanedItems = await uploadSortingItemImages(getCleanedSortingItems());
        const cleanedCategories = getCleanedSortingCategories();

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "sorting-category",
          prompt: prompt.trim(),
          question_data: {
            sortingItems: cleanedItems,
            sortingCategories: cleanedCategories,
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }


      if (questionType === "image-question") {
        const imageData = await uploadQuestionImage();

        const { error } = await supabase.from("questions").insert({
          assessment_id: assessmentId,
          question_type: "image-question",
          prompt: prompt.trim(),
          question_data: {
            imageUrl: imageData.imageUrl,
            imagePath: imageData.imagePath,
            overlayBoxes: getCleanedOverlayBoxes(),
            overlayAnswerMode,
            draggableChoices:
              overlayAnswerMode === "drag-drop-text"
                ? getCleanedDraggableChoices()
                : [],
            draggableImageChoices:
              overlayAnswerMode === "drag-drop-image"
                ? await uploadDraggableImageChoices()
                : [],
          },
          question_order: questions.length + 1,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      resetQuestionForm();
      loadAssessment(assessmentId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
      setUploadingImage(false);
    }
  }

  function startEditingQuestion(question: Question) {
    setEditingQuestionId(question.id);
    setQuestionType(question.question_type);

    if (question.question_type === "fill-in-the-blank") {
      setPrompt(question.question_data.template || question.prompt);
    } else {
      setPrompt(question.prompt);
    }

    if (question.question_type === "multiple-choice") {
      const choices = question.question_data.choices || ["", "", "", ""];
      const correctChoice = question.question_data.correctAnswer || choices[0];

      setChoiceA(choices[0] || "");
      setChoiceB(choices[1] || "");
      setChoiceC(choices[2] || "");
      setChoiceD(choices[3] || "");

      const correctIndex = choices.indexOf(correctChoice);
      setCorrectAnswer(["A", "B", "C", "D"][correctIndex] || "A");

      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    if (question.question_type === "short-answer") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");

      setAnswerBoxes(
        question.question_data.answerBoxes &&
          question.question_data.answerBoxes.length > 0
          ? question.question_data.answerBoxes
          : [createAnswerBox()]
      );

      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    if (question.question_type === "fill-in-the-blank") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    if (question.question_type === "sorting-order") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
      setSelectedSortingItemFiles({});
      const savedItems = question.question_data.sortingItems || [];
      setSortingItemPreviewUrls(
        Object.fromEntries(savedItems.map((item) => [item.id, item.imageUrl || ""]))
      );
      const correctOrder = question.question_data.correctOrder || savedItems.map((item) => item.id);
      const orderedItems = correctOrder
        .map((itemId) => savedItems.find((item) => item.id === itemId))
        .filter(Boolean) as SortingItem[];
      const remainingItems = savedItems.filter(
        (item) => !correctOrder.includes(item.id)
      );
      setSortingItems(
        [...orderedItems, ...remainingItems].length > 0
          ? [...orderedItems, ...remainingItems]
          : [createSortingItem(), createSortingItem()]
      );
      setSortingCategories([createSortingCategory("Category 1"), createSortingCategory("Category 2")]);
    }

    if (question.question_type === "sorting-category") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl("");
      setExistingImagePath("");
      setImagePreviewUrl("");
      setOverlayBoxes([]);
      setSelectedOverlayBoxId(null);
      setOverlayAnswerMode("text-entry");
      setDraggableChoices([createDraggableChoice()]);
      setDraggableImageChoices([]);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
      setSelectedSortingItemFiles({});
      setSortingItemPreviewUrls(
        Object.fromEntries(
          (question.question_data.sortingItems || []).map((item) => [item.id, item.imageUrl || ""])
        )
      );
      setSortingItems(
        (question.question_data.sortingItems || []).length > 0
          ? question.question_data.sortingItems || []
          : [createSortingItem(), createSortingItem()]
      );
      setSortingCategories(
        (question.question_data.sortingCategories || []).length > 0
          ? question.question_data.sortingCategories || []
          : [createSortingCategory("Category 1"), createSortingCategory("Category 2")]
      );
    }

    if (question.question_type === "image-question") {
      setChoiceA("");
      setChoiceB("");
      setChoiceC("");
      setChoiceD("");
      setCorrectAnswer("A");
      setAnswerBoxes([createAnswerBox()]);
      setSelectedImageFile(null);
      setExistingImageUrl(question.question_data.imageUrl || "");
      setExistingImagePath(question.question_data.imagePath || "");
      setImagePreviewUrl(question.question_data.imageUrl || "");
      setOverlayBoxes(question.question_data.overlayBoxes || []);
      setSelectedOverlayBoxId(
        question.question_data.overlayBoxes?.[0]?.id || null
      );
      setOverlayAnswerMode(question.question_data.overlayAnswerMode || "text-entry");
      setDraggableChoices(
        question.question_data.draggableChoices &&
          question.question_data.draggableChoices.length > 0
          ? question.question_data.draggableChoices
          : [createDraggableChoice()]
      );
      setDraggableImageChoices(question.question_data.draggableImageChoices || []);
      setSelectedImageChoiceFiles({});
      setImageChoicePreviewUrls({});
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function updateQuestion() {
    if (!assessmentId || !editingQuestionId) {
      return;
    }

    if (!validateQuestionForm()) {
      return;
    }

    try {
      if (questionType === "multiple-choice") {
        const choices = getChoicesFromForm();
        const correctChoice = getCorrectChoice(choices);

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "multiple-choice",
            prompt: prompt.trim(),
            question_data: {
              choices,
              correctAnswer: correctChoice,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "short-answer") {
        const cleanedAnswerBoxes = answerBoxes.map((box, index) => ({
          id: box.id || crypto.randomUUID(),
          label: box.label.trim() || `Answer ${index + 1}`,
          correctAnswer: box.correctAnswer.trim(),
        }));

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "short-answer",
            prompt: prompt.trim(),
            question_data: {
              answerBoxes: cleanedAnswerBoxes,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "fill-in-the-blank") {
        const blanks = extractBlanksFromTemplate(prompt);

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "fill-in-the-blank",
            prompt: makeStudentPreview(prompt.trim()),
            question_data: {
              template: prompt.trim(),
              blanks,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "sorting-order") {
        const cleanedItems = await uploadSortingItemImages(getCleanedSortingItems());

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "sorting-order",
            prompt: prompt.trim(),
            question_data: {
              sortingItems: cleanedItems.map(({ id, text, imageUrl, imagePath }) => ({
                id,
                text,
                imageUrl,
                imagePath,
              })),
              correctOrder: cleanedItems.map((item) => item.id),
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "sorting-category") {
        const cleanedItems = await uploadSortingItemImages(getCleanedSortingItems());
        const cleanedCategories = getCleanedSortingCategories();

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "sorting-category",
            prompt: prompt.trim(),
            question_data: {
              sortingItems: cleanedItems,
              sortingCategories: cleanedCategories,
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (questionType === "image-question") {
        const imageData = await uploadQuestionImage();

        const { error } = await supabase
          .from("questions")
          .update({
            question_type: "image-question",
            prompt: prompt.trim(),
            question_data: {
              imageUrl: imageData.imageUrl,
              imagePath: imageData.imagePath,
              overlayBoxes: getCleanedOverlayBoxes(),
              overlayAnswerMode,
              draggableChoices:
                overlayAnswerMode === "drag-drop-text"
                  ? getCleanedDraggableChoices()
                  : [],
              draggableImageChoices:
                overlayAnswerMode === "drag-drop-image"
                  ? await uploadDraggableImageChoices()
                  : [],
            },
          })
          .eq("id", editingQuestionId);

        if (error) {
          alert(error.message);
          return;
        }
      }

      resetQuestionForm();
      loadAssessment(assessmentId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
      setUploadingImage(false);
    }
  }

  async function publishAssessment() {
    if (!assessmentId) {
      return;
    }

    if (questions.length === 0) {
      alert("Add at least one question before publishing.");
      return;
    }

    const { error } = await supabase
      .from("assessments")
      .update({ is_published: true })
      .eq("id", assessmentId);

    if (error) {
      alert(error.message);
      return;
    }

    loadAssessment(assessmentId);
  }

  async function unpublishAssessment() {
    if (!assessmentId) {
      return;
    }

    const { error } = await supabase
      .from("assessments")
      .update({ is_published: false })
      .eq("id", assessmentId);

    if (error) {
      alert(error.message);
      return;
    }

    loadAssessment(assessmentId);
  }

  async function deleteQuestion(questionId: string) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this question?"
    );

    if (!confirmDelete) {
      return;
    }

    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", questionId);

    if (error) {
      alert(error.message);
      return;
    }

    if (editingQuestionId === questionId) {
      resetQuestionForm();
    }

    loadAssessment(assessmentId);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        Loading assessment...
      </main>
    );
  }

  if (!assessment) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        Assessment not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a href="/teacher" className="text-sm text-blue-300 hover:underline">
            ← Back to Teacher Dashboard
          </a>

          <a
            href={`/teacher/assessments/${assessmentId}/results`}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            View Results
          </a>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h1 className="text-4xl font-bold">{assessment.title}</h1>

              {assessment.description && (
                <p className="mt-3 text-slate-300">
                  {assessment.description}
                </p>
              )}

              <p className="mt-4 text-sm text-slate-400">
                Student Code:{" "}
                <span className="font-mono text-lg text-blue-300">
                  {assessment.assessment_code}
                </span>
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Status:{" "}
                <span
                  className={
                    assessment.is_published
                      ? "text-green-300"
                      : "text-yellow-300"
                  }
                >
                  {assessment.is_published ? "Published" : "Draft"}
                </span>
              </p>
            </div>

            {assessment.is_published ? (
              <button
                onClick={unpublishAssessment}
                className="rounded-xl border border-yellow-700 px-4 py-2 text-sm font-semibold text-yellow-200 hover:bg-yellow-950"
              >
                Unpublish
              </button>
            ) : (
              <button
                onClick={publishAssessment}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
              >
                Publish
              </button>
            )}
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">
            {editingQuestionId ? "Edit Question" : "Add Question"}
          </h2>

          {editingQuestionId && (
            <p className="mt-2 text-sm text-yellow-300">
              You are currently editing an existing question.
            </p>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-slate-300">Question Type</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                value={questionType}
                onChange={(event) =>
                  setQuestionType(event.target.value as QuestionType)
                }
              >
                <option value="multiple-choice">Multiple Choice</option>
                <option value="short-answer">Short Answer</option>
                <option value="fill-in-the-blank">Fill in the Blank</option>
                <option value="sorting-order">Sorting: Put in Order</option>
                <option value="sorting-category">Sorting: Categories</option>
                <option value="image-question">Image Overlay Question</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-300">
                {questionType === "fill-in-the-blank"
                  ? "Question with Blanks"
                  : "Question"}
              </label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  questionType === "fill-in-the-blank"
                    ? "Example: A triangle has [[3]] sides and angle sum [[180]] degrees."
                    : questionType === "image-question"
                    ? "Example: Label the image by typing or dragging answers into the boxes."
                    : questionType === "sorting-order"
                    ? "Example: Put these numbers in order from smallest to largest."
                    : questionType === "sorting-category"
                    ? "Example: Sort each item into the correct category."
                    : "Example: Solve the following question."
                }
              />

              {questionType === "fill-in-the-blank" && (
                <div className="mt-3 rounded-xl border border-blue-900 bg-blue-950/30 p-4 text-sm text-blue-100">
                  <p className="font-semibold">How to make blanks:</p>
                  <p className="mt-1">
                    Put the correct answer inside double square brackets.
                  </p>
                  <p className="mt-2 font-mono text-blue-200">
                    Example: The answer is [[56]].
                  </p>

                  <p className="mt-3 text-slate-300">Student preview:</p>
                  <p className="mt-1 rounded-lg bg-slate-950 p-3">
                    {prompt.trim()
                      ? makeStudentPreview(prompt)
                      : "Your preview will appear here."}
                  </p>
                </div>
              )}
            </div>

            {questionType === "multiple-choice" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-slate-300">Choice A</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceA}
                      onChange={(event) => setChoiceA(event.target.value)}
                      placeholder="Example: 48"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">Choice B</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceB}
                      onChange={(event) => setChoiceB(event.target.value)}
                      placeholder="Example: 54"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">Choice C</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceC}
                      onChange={(event) => setChoiceC(event.target.value)}
                      placeholder="Example: 56"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-slate-300">Choice D</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                      value={choiceD}
                      onChange={(event) => setChoiceD(event.target.value)}
                      placeholder="Example: 64"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-300">
                    Correct Answer
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                    value={correctAnswer}
                    onChange={(event) => setCorrectAnswer(event.target.value)}
                  >
                    <option value="A">Choice A</option>
                    <option value="B">Choice B</option>
                    <option value="C">Choice C</option>
                    <option value="D">Choice D</option>
                  </select>
                </div>
              </>
            )}

            {questionType === "short-answer" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Answer Boxes</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Add as many answer boxes as this question needs.
                    </p>
                  </div>

                  <button
                    onClick={addAnswerBox}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Answer Box
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  {answerBoxes.map((answerBox, index) => (
                    <div
                      key={answerBox.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-semibold">
                          Answer Box {index + 1}
                        </h4>

                        <button
                          onClick={() => removeAnswerBox(answerBox.id)}
                          className="rounded-lg border border-red-800 px-3 py-1 text-sm text-red-300 hover:bg-red-950"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-sm text-slate-300">
                            Label / Instruction
                          </label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={answerBox.label}
                            onChange={(event) =>
                              updateAnswerBox(
                                answerBox.id,
                                "label",
                                event.target.value
                              )
                            }
                            placeholder={`Example: Answer ${index + 1}`}
                          />
                        </div>

                        <div>
                          <label className="text-sm text-slate-300">
                            Correct Answer
                          </label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={answerBox.correctAnswer}
                            onChange={(event) =>
                              updateAnswerBox(
                                answerBox.id,
                                "correctAnswer",
                                event.target.value
                              )
                            }
                            placeholder="Example: 56"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questionType === "sorting-order" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Correct Order</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Enter the items in the correct order. Students will see them mixed up and drag them into this order.
                    </p>
                  </div>

                  <button
                    onClick={addSortingItem}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Item
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {sortingItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                        <div className="text-sm font-semibold text-slate-400 lg:w-16">
                          #{index + 1}
                        </div>

                        <div className="grid flex-1 gap-4 md:grid-cols-[1fr_240px]">
                          <div>
                            <label className="text-sm text-slate-300">Item text</label>
                            <input
                              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                              value={item.text}
                              onChange={(event) =>
                                updateSortingItem(item.id, "text", event.target.value)
                              }
                              placeholder={`Item ${index + 1}`}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                              You can use text, an image, or both.
                            </p>
                          </div>

                          <div>
                            <label className="text-sm text-slate-300">Item image</label>
                            <input
                              type="file"
                              accept="image/*"
                              className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white"
                              onChange={(event) =>
                                updateSortingItemFile(item.id, event.target.files?.[0] || null)
                              }
                            />
                            {sortingItemPreviewUrls[item.id] && (
                              <div className="mt-3 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-2">
                                <img
                                  src={sortingItemPreviewUrls[item.id]}
                                  alt={item.text || `Item ${index + 1}`}
                                  className="h-24 w-24 rounded-lg object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 lg:self-center">
                          <button
                            onClick={() => moveSortingItem(item.id, "up")}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveSortingItem(item.id, "down")}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeSortingItem(item.id)}
                            className="rounded-lg border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questionType === "sorting-category" && (
              <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Categories</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Order does not matter. Students just need to place each item in the correct category.
                    </p>
                  </div>

                  <button
                    onClick={addSortingCategory}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Category
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {sortingCategories.map((category, index) => (
                    <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <label className="text-sm text-slate-300">Category {index + 1}</label>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                          value={category.name}
                          onChange={(event) => updateSortingCategory(category.id, event.target.value)}
                          placeholder={`Category ${index + 1}`}
                        />
                        <button
                          onClick={() => removeSortingCategory(category.id)}
                          className="rounded-lg border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">Items</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      For each item, choose the category it belongs in.
                    </p>
                  </div>

                  <button
                    onClick={addSortingItem}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {sortingItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-800 bg-slate-900 p-4"
                    >
                      <div className="grid gap-4 xl:grid-cols-[1.1fr_260px_260px_auto] xl:items-end">
                        <div>
                          <label className="text-sm text-slate-300">Item {index + 1} text</label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={item.text}
                            onChange={(event) => updateSortingItem(item.id, "text", event.target.value)}
                            placeholder={`Item ${index + 1}`}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Optional if you are using an image.
                          </p>
                        </div>

                        <div>
                          <label className="text-sm text-slate-300">Item image</label>
                          <input
                            type="file"
                            accept="image/*"
                            className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white"
                            onChange={(event) =>
                              updateSortingItemFile(item.id, event.target.files?.[0] || null)
                            }
                          />
                          {sortingItemPreviewUrls[item.id] && (
                            <img
                              src={sortingItemPreviewUrls[item.id]}
                              alt={item.text || `Item ${index + 1}`}
                              className="mt-3 h-20 w-20 rounded-lg border border-slate-700 object-cover"
                            />
                          )}
                        </div>

                        <div>
                          <label className="text-sm text-slate-300">Correct Category</label>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                            value={item.correctCategoryId || ""}
                            onChange={(event) => updateSortingItem(item.id, "correctCategoryId", event.target.value)}
                          >
                            <option value="">Choose category</option>
                            {sortingCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name || "Untitled category"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={() => removeSortingItem(item.id)}
                          className="rounded-lg border border-red-800 px-3 py-3 text-sm text-red-300 hover:bg-red-950"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questionType === "image-question" && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <h3 className="text-lg font-semibold">
                  Image Overlay Question
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Upload an image, place answer zones, then choose whether
                  students type answers or drag choices into the zones.
                </p>

                <div className="mt-5">
                  <label className="text-sm text-slate-300">
                    Student Answer Format
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                    value={overlayAnswerMode}
                    onChange={(event) =>
                      setOverlayAnswerMode(
                        event.target.value as OverlayAnswerMode
                      )
                    }
                  >
                    <option value="text-entry">Text Entry</option>
                    <option value="drag-drop-text">
                      Drag and Drop Text Choices
                    </option>
                    <option value="drag-drop-image">
                      Drag and Drop Image Choices
                    </option>
                  </select>
                </div>

                <input
                  className="mt-5 block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    handleImageFileChange(event.target.files?.[0] || null)
                  }
                />

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-300">
                      Overlay boxes: {overlayBoxes.length}
                    </p>
                    <p className="text-xs text-slate-500">
                      Drag boxes to move them. Use the bottom-right corner to
                      resize.
                    </p>
                  </div>

                  <button
                    onClick={addOverlayBox}
                    className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                  >
                    Add Overlay Box
                  </button>
                </div>

                {imagePreviewUrl && (
                  <div className="mt-5 space-y-5">
                    <div>
                      <p className="mb-2 text-sm text-slate-300">
                        Image Preview
                      </p>

                      <div
                        ref={imageAreaRef}
                        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
                      >
                        <img
                          src={imagePreviewUrl}
                          alt="Question image preview"
                          className="pointer-events-none block w-full"
                        />

                        {overlayBoxes.map((box, index) => {
                          const isSelected = selectedOverlayBoxId === box.id;

                          return (
                            <div
                              key={box.id}
                              onPointerDown={(event) =>
                                startOverlayDrag(event, box, "move")
                              }
                              className={
                                isSelected
                                  ? "absolute cursor-move border-2 border-yellow-300 bg-yellow-400/10"
                                  : "absolute cursor-move border-2 border-blue-400 bg-blue-500/10"
                              }
                              style={{
                                left: `${box.x}%`,
                                top: `${box.y}%`,
                                width: `${box.width}%`,
                                height: `${box.height}%`,
                              }}
                            >
                              <div
                                className={
                                  isSelected
                                    ? "absolute left-0 top-0 rounded-br bg-yellow-400 px-1 py-0.5 text-[10px] font-semibold text-slate-950"
                                    : "absolute left-0 top-0 rounded-br bg-blue-500 px-1 py-0.5 text-[10px] font-semibold text-white"
                                }
                              >
                                {box.label.trim() || `Box ${index + 1}`}
                              </div>

                              <div
                                onPointerDown={(event) =>
                                  startOverlayDrag(event, box, "resize")
                                }
                                className={
                                  isSelected
                                    ? "absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-tl bg-yellow-400"
                                    : "absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-tl bg-blue-500"
                                }
                                title="Drag to resize"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {overlayBoxes.length > 0 && (
                      <div className="space-y-4">
                        {overlayBoxes.map((box, index) => {
                          const isSelected = selectedOverlayBoxId === box.id;

                          return (
                            <div
                              key={box.id}
                              className={
                                isSelected
                                  ? "rounded-xl border border-yellow-500 bg-yellow-950/20 p-4"
                                  : "rounded-xl border border-slate-800 bg-slate-900 p-4"
                              }
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <button
                                  onClick={() =>
                                    setSelectedOverlayBoxId(box.id)
                                  }
                                  className={
                                    isSelected
                                      ? "font-semibold text-yellow-300"
                                      : "font-semibold text-white"
                                  }
                                >
                                  Overlay Box {index + 1}
                                </button>

                                <button
                                  onClick={() => removeOverlayBox(box.id)}
                                  className="rounded-lg border border-red-800 px-3 py-1 text-sm text-red-300 hover:bg-red-950"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div>
                                  <label className="text-sm text-slate-300">
                                    Label / Instruction
                                  </label>
                                  <input
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.label}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "label",
                                        event.target.value
                                      )
                                    }
                                    placeholder={`Example: Box ${index + 1}`}
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Correct Answer
                                  </label>

                                  {overlayAnswerMode === "drag-drop-image" ? (
                                    <select
                                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                      value={box.correctAnswer}
                                      onChange={(event) =>
                                        updateOverlayBox(
                                          box.id,
                                          "correctAnswer",
                                          event.target.value
                                        )
                                      }
                                    >
                                      <option value="">
                                        Choose the correct image choice
                                      </option>
                                      {draggableImageChoices.map((choice, choiceIndex) => (
                                        <option key={choice.id} value={choice.id}>
                                          {choice.label.trim() ||
                                            `Image Choice ${choiceIndex + 1}`}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                      value={box.correctAnswer}
                                      onChange={(event) =>
                                        updateOverlayBox(
                                          box.id,
                                          "correctAnswer",
                                          event.target.value
                                        )
                                      }
                                      placeholder="Example: leaf"
                                    />
                                  )}

                                  {overlayAnswerMode === "drag-drop-image" &&
                                    draggableImageChoices.length === 0 && (
                                      <p className="mt-2 text-xs text-yellow-300">
                                        Add image choices below before choosing
                                        the correct answer.
                                      </p>
                                    )}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                  <label className="text-sm text-slate-300">
                                    X (% from left)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.x}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "x",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Y (% from top)
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.y}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "y",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Width (%)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.width}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "width",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>

                                <div>
                                  <label className="text-sm text-slate-300">
                                    Height (%)
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                                    value={box.height}
                                    onChange={(event) =>
                                      updateOverlayBox(
                                        box.id,
                                        "height",
                                        Number(event.target.value)
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {overlayAnswerMode === "drag-drop-text" && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">
                              Draggable Choices
                            </h3>
                            <p className="mt-1 text-sm text-slate-400">
                              Students will drag these choices into the overlay
                              boxes.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={addCorrectAnswersAsChoices}
                              className="rounded-xl border border-green-700 px-4 py-2 text-sm font-semibold text-green-300 hover:bg-green-950"
                            >
                              Add Correct Answers as Choices
                            </button>

                            <button
                              onClick={addDraggableChoice}
                              className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                            >
                              Add Choice
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 space-y-3">
                          {draggableChoices.map((choice, index) => (
                            <div
                              key={choice.id}
                              className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 sm:flex-row"
                            >
                              <input
                                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                                value={choice.text}
                                onChange={(event) =>
                                  updateDraggableChoice(
                                    choice.id,
                                    event.target.value
                                  )
                                }
                                placeholder={`Choice ${index + 1}`}
                              />

                              <button
                                onClick={() =>
                                  removeDraggableChoice(choice.id)
                                }
                                className="rounded-xl border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {overlayAnswerMode === "drag-drop-image" && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">
                              Draggable Image Choices
                            </h3>
                            <p className="mt-1 text-sm text-slate-400">
                              Students will drag these images into the overlay
                              boxes.
                            </p>
                          </div>

                          <button
                            onClick={addDraggableImageChoice}
                            className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                          >
                            Add Image Choice
                          </button>
                        </div>

                        {draggableImageChoices.length === 0 ? (
                          <p className="mt-5 text-sm text-slate-400">
                            Add at least one image choice.
                          </p>
                        ) : (
                          <div className="mt-5 space-y-4">
                            {draggableImageChoices.map((choice, index) => {
                              const previewUrl =
                                imageChoicePreviewUrls[choice.id] ||
                                choice.imageUrl;

                              return (
                                <div
                                  key={choice.id}
                                  className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="flex-1 space-y-3">
                                      <div>
                                        <label className="text-sm text-slate-300">
                                          Choice Label
                                        </label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                                          value={choice.label}
                                          onChange={(event) =>
                                            updateDraggableImageChoiceLabel(
                                              choice.id,
                                              event.target.value
                                            )
                                          }
                                          placeholder={`Image Choice ${
                                            index + 1
                                          }`}
                                        />
                                      </div>

                                      <div>
                                        <label className="text-sm text-slate-300">
                                          Choice Image
                                        </label>
                                        <input
                                          className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
                                          type="file"
                                          accept="image/*"
                                          onChange={(event) =>
                                            handleDraggableImageChoiceFile(
                                              choice.id,
                                              event.target.files?.[0] || null
                                            )
                                          }
                                        />
                                      </div>
                                    </div>

                                    {previewUrl && (
                                      <img
                                        src={previewUrl}
                                        alt={choice.label || "Choice preview"}
                                        className="h-24 w-24 rounded-xl border border-slate-700 object-contain"
                                      />
                                    )}

                                    <button
                                      onClick={() =>
                                        removeDraggableImageChoice(choice.id)
                                      }
                                      className="rounded-xl border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
                      <p className="font-semibold text-slate-200">
                        Current grading mode:
                      </p>
                      <p className="mt-1 text-slate-400">
                        {imageQuestionIsScored
                          ? overlayAnswerMode === "drag-drop-text"
                            ? "This image question is scored by text drag-and-drop choices."
                            : overlayAnswerMode === "drag-drop-image"
                            ? "This image question is scored by image drag-and-drop choices."
                            : "This image question is scored by typed answers."
                          : "This image question is currently unscored because it has no overlay boxes."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {editingQuestionId ? (
                <>
                  <button
                    onClick={updateQuestion}
                    disabled={uploadingImage}
                    className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingImage ? "Uploading..." : "Update Question"}
                  </button>

                  <button
                    onClick={resetQuestionForm}
                    className="rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Cancel Edit
                  </button>
                </>
              ) : (
                <button
                  onClick={addQuestion}
                  disabled={uploadingImage}
                  className="rounded-xl bg-blue-500 px-6 py-3 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingImage ? "Uploading..." : "Save Question"}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Questions</h2>

          {questions.length === 0 ? (
            <p className="mt-4 text-slate-400">
              This assessment does not have any questions yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div className="w-full">
                      <p className="text-sm text-slate-500">
                        Question {index + 1} ·{" "}
                        {question.question_type === "multiple-choice"
                          ? "Multiple Choice"
                          : question.question_type === "short-answer"
                          ? "Short Answer"
                          : question.question_type === "fill-in-the-blank"
                          ? "Fill in the Blank"
                          : question.question_data.overlayAnswerMode ===
                            "drag-drop-text"
                          ? "Image Text Drag and Drop"
                          : question.question_data.overlayAnswerMode ===
                            "drag-drop-image"
                          ? "Image Drag and Drop"
                          : "Image Text Entry"}
                      </p>

                      <h3 className="mt-2 text-xl font-semibold">
                        {question.prompt}
                      </h3>

                      {question.question_type === "multiple-choice" && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {question.question_data.choices?.map(
                            (choice, choiceIndex) => (
                              <div
                                key={`${question.id}-${choiceIndex}`}
                                className={
                                  choice ===
                                  question.question_data.correctAnswer
                                    ? "rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                                    : "rounded-xl border border-slate-700 p-3 text-slate-300"
                                }
                              >
                                {choice}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {question.question_type === "short-answer" && (
                        <div className="mt-4 space-y-2">
                          {question.question_data.answerBoxes?.map(
                            (answerBox, answerBoxIndex) => (
                              <div
                                key={answerBox.id}
                                className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                              >
                                <span className="font-semibold">
                                  {answerBox.label ||
                                    `Answer ${answerBoxIndex + 1}`}
                                  :
                                </span>{" "}
                                {answerBox.correctAnswer}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {question.question_type === "fill-in-the-blank" && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm text-slate-400">
                            Original template:
                          </p>
                          <p className="rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-slate-200">
                            {question.question_data.template}
                          </p>

                          <div className="mt-3 space-y-2">
                            {question.question_data.blanks?.map(
                              (blank, blankIndex) => (
                                <div
                                  key={blank.id}
                                  className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                                >
                                  <span className="font-semibold">
                                    Blank {blankIndex + 1}:
                                  </span>{" "}
                                  {blank.correctAnswer}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {question.question_type === "sorting-order" && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm text-slate-400">Correct order:</p>
                          {(question.question_data.correctOrder || []).map((itemId, orderIndex) => {
                            const item = question.question_data.sortingItems?.find((savedItem) => savedItem.id === itemId);
                            return (
                              <div
                                key={itemId}
                                className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                              >
                                <div className="flex items-center gap-3">
                                  {item?.imageUrl && (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.text || `Item ${orderIndex + 1}`}
                                      className="h-14 w-14 rounded-lg border border-green-700 object-cover"
                                    />
                                  )}
                                  <div>
                                    <span className="font-semibold">#{orderIndex + 1}:</span>{" "}
                                    {item ? getSortingItemDisplayLabel(item, `Item ${orderIndex + 1}`) : "Missing item"}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {question.question_type === "sorting-category" && (
                        <div className="mt-4 space-y-4">
                          {question.question_data.sortingCategories?.map((category) => (
                            <div key={category.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                              <p className="font-semibold text-blue-200">{category.name}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {question.question_data.sortingItems
                                  ?.filter((item) => item.correctCategoryId === category.id)
                                  .map((item, itemIndex) => (
                                    <div key={item.id} className="flex items-center gap-2 rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-sm text-green-200">
                                      {item.imageUrl && (
                                        <img
                                          src={item.imageUrl}
                                          alt={item.text || `Item ${itemIndex + 1}`}
                                          className="h-10 w-10 rounded-md border border-green-700 object-cover"
                                        />
                                      )}
                                      <span>{getSortingItemDisplayLabel(item, `Item ${itemIndex + 1}`)}</span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {question.question_type === "image-question" &&
                        question.question_data.imageUrl && (
                          <div className="mt-4 space-y-4">
                            <div className="relative mx-auto w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                              <img
                                src={question.question_data.imageUrl}
                                alt="Question image"
                                className="block w-full"
                              />

                              {question.question_data.overlayBoxes?.map(
                                (box, overlayIndex) => (
                                  <div
                                    key={box.id}
                                    className="absolute border-2 border-green-400 bg-green-500/10"
                                    style={{
                                      left: `${box.x}%`,
                                      top: `${box.y}%`,
                                      width: `${box.width}%`,
                                      height: `${box.height}%`,
                                    }}
                                  >
                                    <div className="absolute left-0 top-0 rounded-br bg-green-600 px-1 py-0.5 text-[10px] font-semibold text-white">
                                      {box.label.trim() ||
                                        `Box ${overlayIndex + 1}`}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>

                            {(question.question_data.overlayBoxes || []).length >
                            0 ? (
                              <div className="space-y-2">
                                {question.question_data.overlayBoxes?.map(
                                  (box, overlayIndex) => (
                                    <div
                                      key={box.id}
                                      className="rounded-xl border border-green-700 bg-green-950/40 p-3 text-green-200"
                                    >
                                      <span className="font-semibold">
                                        {box.label || `Box ${overlayIndex + 1}`}:
                                      </span>{" "}
                                      {question.question_data.overlayAnswerMode ===
                                      "drag-drop-image"
                                        ? question.question_data.draggableImageChoices?.find(
                                            (choice) =>
                                              choice.id === box.correctAnswer
                                          )?.label || "No correct image selected"
                                        : box.correctAnswer}
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                This image question currently has no overlay
                                answer boxes.
                              </p>
                            )}

                            {question.question_data.overlayAnswerMode ===
                              "drag-drop-text" && (
                              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                                <p className="text-sm font-semibold text-slate-300">
                                  Draggable choices:
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {question.question_data.draggableChoices?.map(
                                    (choice) => (
                                      <span
                                        key={choice.id}
                                        className="rounded-lg border border-blue-700 bg-blue-950 px-3 py-2 text-sm text-blue-100"
                                      >
                                        {choice.text}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                            {question.question_data.overlayAnswerMode ===
                              "drag-drop-image" && (
                              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                                <p className="text-sm font-semibold text-slate-300">
                                  Draggable image choices:
                                </p>
                                <div className="mt-3 flex flex-wrap gap-3">
                                  {question.question_data.draggableImageChoices?.map(
                                    (choice) => (
                                      <div
                                        key={choice.id}
                                        className="rounded-xl border border-blue-700 bg-blue-950 p-2 text-center text-sm text-blue-100"
                                      >
                                        <img
                                          src={choice.imageUrl}
                                          alt={choice.label}
                                          className="h-20 w-20 rounded-lg object-contain"
                                        />
                                        <p className="mt-1">{choice.label}</p>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                    </div>

                    <div className="flex h-fit flex-wrap gap-3">
                      <button
                        onClick={() => startEditingQuestion(question)}
                        className="rounded-xl border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-950"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteQuestion(question.id)}
                        className="rounded-xl border border-red-800 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}